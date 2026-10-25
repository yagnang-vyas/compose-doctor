"""Image rules."""

from __future__ import annotations

from compose_doctor.interpolation import contains_interpolation
from compose_doctor.model import ComposeFile, Finding, Service, Severity
from compose_doctor.rules.base import Rule, key, text
from compose_doctor.rules.parsing import parse_image


def check_unpinned_image(service: Service, compose: ComposeFile) -> list[Finding]:
    image_key = key(service, "image")
    reference = text(service.raw.get("image"))
    if image_key is None or reference is None:
        return []
    image = parse_image(reference.strip())
    if image.digest is not None:
        return []
    if image.tag is None:
        if contains_interpolation(image.repository):
            return []  # the whole reference may come from a variable; the tag is unknown
        message = f"Image '{reference}' has no tag, so it resolves to 'latest'"
    elif image.tag == "latest":
        message = f"Image '{reference}' uses the 'latest' tag"
    else:
        return []  # a pinned or interpolated tag
    return [UNPINNED_IMAGE.finding(compose, service, image_key, message)]


UNPINNED_IMAGE = Rule(
    id="CD001",
    title="Unpinned image",
    severity=Severity.WARNING,
    rationale=(
        "An image without a tag, or with the 'latest' tag, can change underneath you: a redeploy "
        "or a fresh host silently pulls a different version, which breaks reproducibility and "
        "can introduce untested or vulnerable code."
    ),
    fix="Pin a specific version tag (postgres:16.4) or a digest (image@sha256:...).",
    check=check_unpinned_image,
)

RULES = (UNPINNED_IMAGE,)
