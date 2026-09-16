import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.auth import User
from app.core.security import hash_password

class TestAuthSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = SessionLocal()
        # Asegurar que existe un usuario admin de prueba
        admin = cls.db.query(User).filter(User.username == "admin_test").first()
        if not admin:
            admin = User(
                username="admin_test",
                hashed_password=hash_password("admin_secret_123"),
                full_name="Admin Test User",
                role="ADMIN",
                is_active=True
            )
            cls.db.add(admin)
            cls.db.commit()
            cls.db.refresh(admin)
        cls.test_admin = admin

    @classmethod
    def tearDownClass(cls):
        cls.db.query(User).filter(User.username == "admin_test").delete()
        cls.db.commit()
        cls.db.close()

    def test_01_successful_login(self):
        """ Test: Login exitoso con credenciales válidas """
        resp = self.client.post("/api/auth/login", json={
            "username": "admin_test",
            "password": "admin_secret_123"
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access_token", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["user"]["username"], "admin_test")
        self.assertEqual(data["user"]["role"], "ADMIN")
        print(" -> [PASS] Login exitoso devuelve token JWT y perfil de usuario")

    def test_02_invalid_password(self):
        """ Test: Rechazo con contraseña errónea """
        resp = self.client.post("/api/auth/login", json={
            "username": "admin_test",
            "password": "wrong_password_xyz"
        })
        self.assertEqual(resp.status_code, 401)
        print(" -> [PASS] Contraseña incorrecta rechazada con 401")

    def test_03_non_existent_user(self):
        """ Test: Rechazo con usuario inexistente """
        resp = self.client.post("/api/auth/login", json={
            "username": "ghost_user_999",
            "password": "some_password"
        })
        self.assertEqual(resp.status_code, 401)
        print(" -> [PASS] Usuario inexistente rechazado con 401")

    def test_04_get_current_user_profile(self):
        """ Test: /api/auth/me con Bearer Token válido """
        login_resp = self.client.post("/api/auth/login", json={
            "username": "admin_test",
            "password": "admin_secret_123"
        })
        token = login_resp.json()["access_token"]

        me_resp = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(me_resp.status_code, 200)
        user_data = me_resp.json()
        self.assertEqual(user_data["username"], "admin_test")
        self.assertEqual(user_data["role"], "ADMIN")
        print(" -> [PASS] /api/auth/me devuelve datos del usuario autenticado")

    def test_05_unauthorized_without_token(self):
        """ Test: /api/auth/me sin token es rechazado """
        me_resp = self.client.get("/api/auth/me")
        self.assertEqual(me_resp.status_code, 401)
        print(" -> [PASS] /api/auth/me sin token rechazado con 401")

if __name__ == "__main__":
    unittest.main()
