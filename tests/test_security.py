import pytest
from jose import jwt
from app.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    SECRET_KEY,
    ALGORITHM
)

# ===== Fixtures =====
@pytest.fixture
def sample_password():
    return "test_password_123"

@pytest.fixture
def hashed_password(sample_password):
    return get_password_hash(sample_password)


@pytest.fixture
def sample_username():
    return "Artem"

# ===== Тесты хеширования =====
class TestPasswordHashing:
    def test_password_hashed_creates_hash(self, sample_password):
        hashed = get_password_hash(sample_password)
        assert hashed is not None
        assert len(hashed) > 0
        assert isinstance(hashed, str)


    def test_password_verification_success(self, sample_password, hashed_password):
        assert verify_password(sample_password, hashed_password) is True


    def test_password_verification_failure(self, hashed_password):
        assert verify_password("wrong_password", hashed_password) is False


    def test_different_hashed_for_same_password(self, sample_password):
        hash1 = get_password_hash(sample_password)
        hash2 = get_password_hash(sample_password)
        assert hash1 != hash2


    @pytest.mark.parametrize("password", [
        "short",
        "very_long_password_with_lots_of_characters_123456789",
        "password_with_special_chars_!@#$%^&*()",
        "123456",
    ])
    def test_various_password_hashing(self, password):
        hashed = get_password_hash(password)
        assert verify_password(password, hashed) is True


    def test_hashed_password_is_not_equal_to_plain_text(self, sample_password):
        hash1 = get_password_hash(sample_password)
        assert hash1 != sample_password


    def test_verify_password_returns_true_for_correct_password(self, sample_password):
        hash_example = get_password_hash(sample_password)
        assert verify_password(sample_password,hash_example) is True


    def test_verify_password_returns_false_for_wrong_password(self, hashed_password):
        assert verify_password("wrong_password", hashed_password) is False


# ===== Тесты JWT токенов =====
class TestJWTTokens:
    def test_create_token_returns_string(self, sample_username):
        token = create_access_token(data={"sub": sample_username})
        assert isinstance(token, str)
        assert len(token) > 0


    def test_token_contains_username(self, sample_username):
        token = create_access_token(data={"sub": sample_username})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == sample_username


    @pytest.mark.parametrize("username", [
        "Artem",
        "user123",
        "test_user_with_underscore",
        "UserWithCapital",
    ])
    def test_token_creation_for_various_users(self, username):
        token = create_access_token(data={"sub": username})
        assert isinstance(token, str)

        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == username

# ===== Интеграционные тесты =====
class TestSecurityIntegration:
    def test_full_auth_flow(self, sample_password):
        hashed = get_password_hash(sample_password)
        assert verify_password(sample_password, hashed) is True

        token = create_access_token(data={"sub": "test_user"})
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        assert payload["sub"] == "test_user"
