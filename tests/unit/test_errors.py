from compose_doctor.errors import ComposeDoctorError, InputError


def test_input_error_is_compose_doctor_error() -> None:
    assert issubclass(InputError, ComposeDoctorError)


def test_input_error_message_only() -> None:
    assert str(InputError("bad")) == "bad"


def test_input_error_with_file() -> None:
    assert str(InputError("bad", file="compose.yaml")) == "compose.yaml: bad"


def test_input_error_with_file_and_line() -> None:
    err = InputError("bad", file="compose.yaml", line=3)
    assert str(err) == "compose.yaml:3: bad"
    assert err.message == "bad"
    assert err.line == 3
