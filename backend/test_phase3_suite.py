import unittest
import json
import os
import sys

# Ensure backend path is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.auth import User, AuditLog
from app.core.security import hash_password, check_user_permission, create_access_token

class TestPhase3PermissionsAndAudit(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        cls.db = SessionLocal()

        # Asegurar usuario admin
        admin_user = cls.db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                username="admin",
                hashed_password=hash_password("admin123"),
                full_name="Administrador Prisma Lab",
                role="ADMIN",
                is_active=True,
                can_delete=True,
                can_edit=True,
                read_only=False,
                allowed_modules="dashboard,production,inventory,sales,accounting,config"
            )
            cls.db.add(admin_user)
            cls.db.commit()
            cls.db.refresh(admin_user)
        cls.admin_token = create_access_token({"sub": "admin", "role": "ADMIN", "name": "Administrador Prisma Lab"})

        # Crear usuario limitado de prueba para Phase 3
        test_limited = cls.db.query(User).filter(User.username == "test_limited_p3").first()
        matrix_data = {
            "dashboard": {"read": True, "write": False, "delete": False},
            "inventory": {"read": True, "write": False, "delete": False},
            "sales": {"read": True, "write": False, "delete": False},
            "accounting": {"read": False, "write": False, "delete": False}
        }
        if not test_limited:
            test_limited = User(
                username="test_limited_p3",
                hashed_password=hash_password("test1234"),
                full_name="Usuario Limitado Fase 3",
                role="CUSTOM",
                is_active=True,
                can_delete=False,
                can_edit=False,
                read_only=True,
                allowed_modules="dashboard,inventory,sales",
                permissions_matrix=json.dumps(matrix_data)
            )
            cls.db.add(test_limited)
            cls.db.commit()
            cls.db.refresh(test_limited)
        else:
            test_limited.permissions_matrix = json.dumps(matrix_data)
            cls.db.commit()

        cls.limited_token = create_access_token({"sub": "test_limited_p3", "role": "CUSTOM", "name": "Usuario Limitado Fase 3"})

    @classmethod
    def tearDownClass(cls):
        # Limpiar usuario de prueba si se desea
        cls.db.close()

    def test_01_matrix_permission_evaluation(self):
        admin = self.db.query(User).filter(User.username == "admin").first()
        limited = self.db.query(User).filter(User.username == "test_limited_p3").first()

        # Admin tiene acceso a todo
        self.assertTrue(check_user_permission(admin, "inventory", "read"))
        self.assertTrue(check_user_permission(admin, "inventory", "write"))
        self.assertTrue(check_user_permission(admin, "inventory", "delete"))
        self.assertTrue(check_user_permission(admin, "accounting", "delete"))

        # Usuario limitado según matriz
        self.assertTrue(check_user_permission(limited, "inventory", "read"))
        self.assertFalse(check_user_permission(limited, "inventory", "write"))
        self.assertFalse(check_user_permission(limited, "inventory", "delete"))
        self.assertFalse(check_user_permission(limited, "accounting", "read"))

    def test_02_endpoint_guard_enforces_403(self):
        # El usuario limitado intenta borrar un material de inventario
        headers_limited = {"Authorization": f"Bearer {self.limited_token}"}
        res = self.client.delete("/api/inventory/materials/99999", headers=headers_limited)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Acceso denegado", res.json().get("detail", ""))

    def test_03_login_and_audit_logging(self):
        # Login admin
        login_res = self.client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
        self.assertEqual(login_res.status_code, 200)

        # Consultar bitácora de auditoría como admin
        headers_admin = {"Authorization": f"Bearer {self.admin_token}"}
        logs_res = self.client.get("/api/auth/audit-logs?limit=10", headers=headers_admin)
        self.assertEqual(logs_res.status_code, 200)
        logs = logs_res.json()
        self.assertIsInstance(logs, list)
        self.assertGreater(len(logs), 0)

        # Verificar que el evento de LOGIN está registrado
        actions = [log["action"] for log in logs]
        self.assertIn("LOGIN", actions)

    def test_04_limited_user_cannot_access_audit_logs(self):
        headers_limited = {"Authorization": f"Bearer {self.limited_token}"}
        res = self.client.get("/api/auth/audit-logs", headers=headers_limited)
        self.assertEqual(res.status_code, 403)

if __name__ == "__main__":
    unittest.main()
