import unittest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.auth import User

class UserManagementTestSuite(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        # Login as admin
        res = self.client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin123'})
        self.assertEqual(res.status_code, 200)
        self.admin_token = res.json()['access_token']
        self.admin_headers = {'Authorization': f'Bearer {self.admin_token}'}

    def test_01_admin_get_users(self):
        res = self.client.get('/api/auth/users', headers=self.admin_headers)
        self.assertEqual(res.status_code, 200)
        users = res.json()
        self.assertIsInstance(users, list)
        admin_found = any(u['username'] == 'admin' for u in users)
        self.assertTrue(admin_found)

    def test_02_create_and_manage_user(self):
        # 1. Create a user with specific permissions
        payload = {
            'username': 'op_test_unit',
            'password': 'password123',
            'full_name': 'Operador Pruebas Unitarias',
            'role': 'OPERATOR',
            'is_active': True,
            'can_delete': False,
            'can_edit': True,
            'read_only': False,
            'allowed_modules': 'dashboard,production,inventory'
        }
        res_create = self.client.post('/api/auth/users', json=payload, headers=self.admin_headers)
        self.assertEqual(res_create.status_code, 200)
        created = res_create.json()
        user_id = created['id']
        self.assertEqual(created['username'], 'op_test_unit')
        self.assertEqual(created['can_delete'], False)
        self.assertEqual(created['can_edit'], True)
        self.assertEqual(created['read_only'], False)
        self.assertEqual(created['allowed_modules'], 'dashboard,production,inventory')

        # 2. Login as the newly created user
        res_op_login = self.client.post('/api/auth/login', json={'username': 'op_test_unit', 'password': 'password123'})
        self.assertEqual(res_op_login.status_code, 200)
        op_token = res_op_login.json()['access_token']
        op_headers = {'Authorization': f'Bearer {op_token}'}

        # 3. Newly created operator cannot access admin user list (403 Forbidden)
        res_forbidden = self.client.get('/api/auth/users', headers=op_headers)
        self.assertEqual(res_forbidden.status_code, 403)

        # 4. Admin updates user to read_only=True
        res_update = self.client.put(f'/api/auth/users/{user_id}', json={'read_only': True}, headers=self.admin_headers)
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()['read_only'], True)

        # 5. Admin resets user password
        res_reset = self.client.post(f'/api/auth/users/{user_id}/reset-password', json={'new_password': 'newpassword999'}, headers=self.admin_headers)
        self.assertEqual(res_reset.status_code, 200)

        # 6. Operator logs in with new password
        res_new_login = self.client.post('/api/auth/login', json={'username': 'op_test_unit', 'password': 'newpassword999'})
        self.assertEqual(res_new_login.status_code, 200)

        # 7. Admin cannot delete primary admin
        db = SessionLocal()
        admin_obj = db.query(User).filter(User.username == 'admin').first()
        admin_id = admin_obj.id
        db.close()

        res_cant_del_admin = self.client.delete(f'/api/auth/users/{admin_id}', headers=self.admin_headers)
        self.assertEqual(res_cant_del_admin.status_code, 400)

        # 8. Admin deletes op_test_unit
        res_delete = self.client.delete(f'/api/auth/users/{user_id}', headers=self.admin_headers)
        self.assertEqual(res_delete.status_code, 200)

if __name__ == '__main__':
    unittest.main()
