import common from './common.json'
import homeDashboard from './home/dashboard.json'
import authLogin from './auth/login.json'
import authRegister from './auth/register.json'
import admin from './admin.json'
import chat from './chat.json'

export default {
  common,
  home: {
    dashboard: homeDashboard,
  },
  auth: {
    login: authLogin,
    register: authRegister,
  },
  admin,
  chat,
}
