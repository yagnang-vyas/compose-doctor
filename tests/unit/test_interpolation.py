import pytest

from compose_doctor.interpolation import contains_interpolation


@pytest.mark.parametrize(
    "text",
    [
        "${VAR}",
        "${VAR:-default}",
        "${VAR-default}",
        "${VAR:?must be set}",
        "${VAR?must be set}",
        "${VAR:+alternative}",
        "${VAR+alternative}",
        "$VAR",
        "app:${TAG}",
        "postgres://user:${DB_PASSWORD}@db/app",
        "prefix-$NAME-suffix",
        "$$$VAR",  # an escaped dollar followed by a real reference
        "${A:-${B}}",
        "${_PRIVATE}",
    ],
)
def test_detects_interpolation(text: str) -> None:
    assert contains_interpolation(text)


@pytest.mark.parametrize(
    "text",
    [
        "",
        "plain",
        "$$",
        "$$VAR",
        "$${VAR}",
        "price: 5$",
        "$1",
        "${}",
        "${1VAR}",
        "fake-pass-123",
    ],
)
def test_ignores_non_interpolation(text: str) -> None:
    assert not contains_interpolation(text)
