"""Load Compose files into located values.

PyYAML's ``load`` functions throw away source positions, so this module calls ``yaml.compose``
with ``SafeLoader`` to get a node tree with marks and converts the nodes itself. Aliases are
already shared nodes in that tree; merge keys (``<<``) are applied here with YAML 1.1 semantics.
No Python objects other than plain scalars, ``LocatedMap`` and tuples are ever constructed.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable

import yaml
from yaml.constructor import SafeConstructor
from yaml.nodes import MappingNode, Node, ScalarNode, SequenceNode

from compose_doctor.errors import InputError
from compose_doctor.model import ComposeFile, Located, LocatedMap, Scalar, Service, Value

MAX_NODES = 100_000
"""Upper bound on values produced while converting one document (alias-bomb protection)."""

MAX_DEPTH = 100
"""Upper bound on nesting depth, far beyond anything a real Compose file needs."""

_TAG = "tag:yaml.org,2002:"
_MERGE_TAG = _TAG + "merge"

_constructor = SafeConstructor()

# Only these scalar constructors are used. Any other tag (timestamps, binary, Compose's own
# ``!reset`` / ``!override``) keeps its source text as a string.
_SCALAR_CONSTRUCTORS: dict[str, Callable[[ScalarNode], Scalar]] = {
    _TAG + "null": lambda node: None,
    _TAG + "bool": _constructor.construct_yaml_bool,
    _TAG + "int": _constructor.construct_yaml_int,
    _TAG + "float": _constructor.construct_yaml_float,
}


def load_bytes(data: bytes, path: str) -> ComposeFile:
    """Decode ``data`` as UTF-8 (a leading BOM is allowed) and load it."""
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        line = data[: exc.start].count(b"\n") + 1
        raise InputError("file is not valid UTF-8", file=path, line=line) from None
    return load_text(text, path)


def load_text(text: str, path: str) -> ComposeFile:
    """Parse ``text`` and build a :class:`ComposeFile`. Raises :class:`InputError`."""
    root_node = _compose(text, path)
    if root_node is None:
        raise InputError("file is empty", file=path, line=1)
    if not isinstance(root_node, MappingNode):
        raise InputError("top-level value must be a mapping", file=path, line=_line(root_node))

    root = _Converter(path).convert(root_node)
    assert isinstance(root.value, LocatedMap)  # a MappingNode always converts to a LocatedMap
    return ComposeFile(
        path=path, source=text, root=root.value, services=_services(root.value, path)
    )


def _compose(text: str, path: str) -> Node | None:
    try:
        node: Node | None = yaml.compose(text, Loader=yaml.SafeLoader)
    except yaml.MarkedYAMLError as exc:
        mark = exc.problem_mark or exc.context_mark
        line = mark.line + 1 if mark is not None else None
        if exc.context == "expected a single document in the stream":
            raise InputError(
                "multiple YAML documents in one file are not supported", file=path, line=line
            ) from None
        raise InputError(f"invalid YAML: {exc.problem}", file=path, line=line) from None
    except yaml.YAMLError as exc:  # a reader error without a mark
        raise InputError(f"invalid YAML: {exc}", file=path) from None
    except RecursionError:
        raise InputError("document is nested too deeply", file=path) from None
    return node


def _services(root: LocatedMap, path: str) -> tuple[Service, ...]:
    if "services" not in root:
        raise InputError("missing top-level 'services' key", file=path, line=1)
    services_key, services_value = root.entry("services")
    if not isinstance(services_value.value, LocatedMap):
        raise InputError("'services' must be a mapping", file=path, line=services_key.line)

    services = []
    for name in services_value.value:
        if name.startswith("x-"):
            continue
        key, value = services_value.value.entry(name)
        if not isinstance(value.value, LocatedMap):
            raise InputError(f"service '{name}' must be a mapping", file=path, line=key.line)
        services.append(Service(name=name, line=key.line, column=key.column, raw=value.value))
    return tuple(services)


def _line(node: Node) -> int:
    return node.start_mark.line + 1


def _column(node: Node) -> int:
    return node.start_mark.column + 1


class _Converter:
    """Convert a composed node tree to located values, counting what it produces."""

    def __init__(self, path: str) -> None:
        self._path = path
        self._count = 0
        self._active: set[int] = set()

    def convert(self, node: Node, depth: int = 0) -> Located[Value]:
        self._count += 1
        if self._count > MAX_NODES:
            raise InputError("document expands to too many nodes", file=self._path)
        if depth > MAX_DEPTH:
            raise InputError("document is nested too deeply", file=self._path, line=_line(node))

        if isinstance(node, ScalarNode):
            return Located(_scalar(node), _line(node), _column(node), raw=node.value)

        if id(node) in self._active:
            raise InputError("recursive alias", file=self._path, line=_line(node))
        self._active.add(id(node))
        try:
            value: Value
            if isinstance(node, MappingNode):
                value = self._mapping(node, depth)
            else:
                assert isinstance(node, SequenceNode)  # the only remaining node kind
                value = tuple(self.convert(item, depth + 1) for item in node.value)
        finally:
            self._active.discard(id(node))
        return Located(value, _line(node), _column(node))

    def _mapping(self, node: MappingNode, depth: int) -> LocatedMap:
        merged: dict[str, tuple[Located[str], Located[Value]]] = {}
        explicit: dict[str, tuple[Located[str], Located[Value]]] = {}

        for key_node, value_node in node.value:
            if key_node.tag == _MERGE_TAG:
                # Earlier merge sources win over later ones, so only fill keys not yet seen.
                for source in self._merge_sources(value_node, depth):
                    for name in source:
                        merged.setdefault(name, source.entry(name))
                continue

            key = self._key(key_node)
            if key.value in explicit:
                raise InputError(f"duplicate key '{key.value}'", file=self._path, line=key.line)
            explicit[key.value] = (key, self.convert(value_node, depth + 1))

        # Keys written in the mapping itself win over merged keys.
        return LocatedMap({**merged, **explicit})

    def _merge_sources(self, node: Node, depth: int) -> Iterable[LocatedMap]:
        items = node.value if isinstance(node, SequenceNode) else [node]
        sources = []
        for item in items:
            if not isinstance(item, MappingNode):
                raise InputError(
                    "merge key '<<' must refer to a mapping or a list of mappings",
                    file=self._path,
                    line=_line(item),
                )
            converted = self.convert(item, depth + 1).value
            assert isinstance(converted, LocatedMap)  # a MappingNode always converts to one
            sources.append(converted)
        return sources

    def _key(self, node: Node) -> Located[str]:
        if not isinstance(node, ScalarNode):
            raise InputError("mapping keys must be scalars", file=self._path, line=_line(node))
        # Keys keep their source text: ``on:`` stays "on" instead of becoming True.
        return Located(node.value, _line(node), _column(node), raw=node.value)


def _scalar(node: ScalarNode) -> Scalar:
    construct = _SCALAR_CONSTRUCTORS.get(node.tag)
    if construct is None:
        return str(node.value)
    return construct(node)
