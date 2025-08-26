import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { crudAPI } from '../../utils/api';
import {
  DocumentTextIcon,
  CalendarIcon,
  ChartBarIcon,
  DevicePhoneMobileIcon,
  ArrowRightOnRectangleIcon,
  ShieldCheckIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await crudAPI.getStats();
      setStats(response.stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary-50 via-white to-primary-50">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white/80 backdrop-blur-sm shadow-soft border-b border-white/20"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              <h1 className="text-3xl font-bold gradient-text flex items-center gap-3">
                <SparklesIcon className="h-8 w-8 text-primary-600" />
                Dashboard
              </h1>
              <p className="text-secondary-600 mt-1">
                Welcome back, <span className="font-semibold text-primary-600">{user?.username}</span>!
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex items-center space-x-4"
            >
              <div className="security-badge">
                <DevicePhoneMobileIcon className="h-4 w-4 mr-1" />
                Secure Session
              </div>
              <motion.button
                onClick={handleLogout}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="btn-secondary flex items-center gap-2"
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
                Logout
              </motion.button>
            </motion.div>
          </div>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {error && (
            <div className="mb-6 rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          {/* Stats Grid */}
          {stats && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8"
            >
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                className="card-elevated p-6 hover-glow"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg">
                      <DocumentTextIcon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-secondary-500 truncate">
                        Total Posts
                      </dt>
                      <dd className="text-2xl font-bold text-secondary-900">
                        {stats.totalPosts}
                      </dd>
                    </dl>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                className="card-elevated p-6 hover-glow"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-gradient-to-r from-success-500 to-success-600 rounded-lg">
                      <CalendarIcon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-secondary-500 truncate">
                        This Week
                      </dt>
                      <dd className="text-2xl font-bold text-secondary-900">
                        {stats.postsThisWeek}
                      </dd>
                    </dl>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                className="card-elevated p-6 hover-glow"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-gradient-to-r from-warning-500 to-warning-600 rounded-lg">
                      <ChartBarIcon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-secondary-500 truncate">
                        This Month
                      </dt>
                      <dd className="text-2xl font-bold text-secondary-900">
                        {stats.postsThisMonth}
                      </dd>
                    </dl>
                  </div>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                className="card-elevated p-6 hover-glow"
              >
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="p-3 bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-lg">
                      <ShieldCheckIcon className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-secondary-500 truncate">
                        Secure Devices
                      </dt>
                      <dd className="text-2xl font-bold text-secondary-900">
                        {stats.activeDeviceKeys}
                      </dd>
                    </dl>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}

          {/* Security Notice */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="glass rounded-xl p-8 mb-8 border border-white/20"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                <div className="p-3 bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg shadow-glow">
                  <ShieldCheckIcon className="h-8 w-8 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-bold text-secondary-900 mb-3 flex items-center gap-2">
                  🛡️ Advanced Security Protection
                  <span className="security-badge text-xs">ACTIVE</span>
                </h3>
                <p className="text-secondary-700 mb-4 leading-relaxed">
                  Your session is protected by <span className="font-semibold text-primary-600">device-bound authentication</span>.
                  This cutting-edge security prevents unauthorized access and automated scraping.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-sm text-secondary-600">
                    <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                    Cryptographically signed requests
                  </div>
                  <div className="flex items-center gap-2 text-sm text-secondary-600">
                    <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                    Token theft protection
                  </div>
                  <div className="flex items-center gap-2 text-sm text-secondary-600">
                    <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                    Anti-scraping measures
                  </div>
                  <div className="flex items-center gap-2 text-sm text-secondary-600">
                    <div className="w-2 h-2 bg-success-500 rounded-full"></div>
                    Device fingerprint monitoring
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="card-elevated p-8"
          >
            <h3 className="text-xl font-bold text-secondary-900 mb-6 flex items-center gap-2">
              <SparklesIcon className="h-6 w-6 text-primary-600" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <motion.button
                onClick={() => navigate('/posts')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn-primary flex items-center justify-center gap-3 py-4"
              >
                <DocumentTextIcon className="h-5 w-5" />
                Manage Posts
              </motion.button>
              <motion.button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="btn-secondary flex items-center justify-center gap-3 py-4"
              >
                <DevicePhoneMobileIcon className="h-5 w-5" />
                View Profile
              </motion.button>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
