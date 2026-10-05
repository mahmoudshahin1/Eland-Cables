import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserAccount, UserType, ModulePermissions } from '../../types';
import {
  ShieldCheck,
  UserPlus,
  Lock,
  Key,
  Users,
  Building2,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Trash2,
  Edit,
  Check,
  X,
  SlidersHorizontal,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

const MODULE_KEYS: { key: keyof ModulePermissions; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview Dashboard', icon: '📊' },
  { key: 'technicalOffice', label: 'Technical Office & Cable Specs', icon: '📐' },
  { key: 'costingPricing', label: 'Costing & Pricing Engine', icon: '💰' },
  { key: 'salesQuotations', label: 'Sales Quotations & CRM', icon: '💼' },
  { key: 'ordersProduction', label: 'Orders & Production Monitoring', icon: '🏭' },
  { key: 'financeCollections', label: 'Finance, Credit & Collections', icon: '💳' },
  { key: 'userManagement', label: 'User Management & Security RBAC', icon: '🔒' },
  { key: 'masterData', label: 'Master Data & ERP Sync', icon: '📂' },
  { key: 'reportsAnalytics', label: 'Reports & Analytics', icon: '📈' },
  { key: 'customerPortalAccess', label: 'Customer Portal View', icon: '🏢' },
];

export const UserManagement: React.FC = () => {
  const { usersList, addUser, updateUser, deleteUser, currentUser } = useAuth();

  // Active view tab: 'users_list' vs 'rbac_matrix'
  const [activeTab, setActiveTab] = useState<'users_list' | 'rbac_matrix'>('users_list');

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [userTypeFilter, setUserTypeFilter] = useState<'all' | 'internal' | 'customer'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal states
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  // Form State for Adding New User
  const [newUserType, setNewUserType] = useState<UserType>('internal');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newUserName, setNewUserName] = useState<string>('');
  const [newEmail, setNewEmail] = useState<string>('');
  const [newDepartment, setNewDepartment] = useState<string>('Sales & Commercial');
  const [newCompanyName, setNewCompanyName] = useState<string>('');
  const [newCustomerCode, setNewCustomerCode] = useState<string>('');
  const [newRole, setNewRole] = useState<string>('Sales Account Officer');
  const [newStatus, setNewStatus] = useState<'Active' | 'Inactive' | 'Pending Approval'>('Active');

  const [newPermissions, setNewPermissions] = useState<ModulePermissions>({
    overview: true,
    technicalOffice: false,
    costingPricing: false,
    salesQuotations: true,
    ordersProduction: false,
    financeCollections: false,
    userManagement: false,
    masterData: false,
    reportsAnalytics: true,
    customerPortalAccess: false,
  });

  // Filtered users list
  const filteredUsers = usersList.filter((user) => {
    const matchesSearch =
      user.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.companyName && user.companyName.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = userTypeFilter === 'all' || user.userType === userTypeFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;

    return matchesSearch && matchesType && matchesStatus;
  });

  // Open Add User Modal with default values
  const handleOpenAddUserModal = () => {
    setNewUserType('internal');
    setNewFullName('');
    setNewUserName('');
    setNewEmail('');
    setNewDepartment('Sales & Commercial');
    setNewCompanyName('');
    setNewCustomerCode('');
    setNewRole('Sales Account Officer');
    setNewStatus('Active');
    setNewPermissions({
      overview: true,
      technicalOffice: false,
      costingPricing: false,
      salesQuotations: true,
      ordersProduction: false,
      financeCollections: false,
      userManagement: false,
      masterData: false,
      reportsAnalytics: true,
      customerPortalAccess: false,
    });
    setIsAddUserModalOpen(true);
  };

  // Reset Permissions Preset
  const applyPermissionPreset = (preset: 'all' | 'customer' | 'sales' | 'tech' | 'costing') => {
    if (preset === 'all') {
      setNewPermissions({
        overview: true,
        technicalOffice: true,
        costingPricing: true,
        salesQuotations: true,
        ordersProduction: true,
        financeCollections: true,
        userManagement: true,
        masterData: true,
        reportsAnalytics: true,
        customerPortalAccess: true,
      });
    } else if (preset === 'customer') {
      setNewPermissions({
        overview: false,
        technicalOffice: false,
        costingPricing: false,
        salesQuotations: false,
        ordersProduction: false,
        financeCollections: false,
        userManagement: false,
        masterData: false,
        reportsAnalytics: false,
        customerPortalAccess: true,
      });
    } else if (preset === 'sales') {
      setNewPermissions({
        overview: true,
        technicalOffice: true,
        costingPricing: true,
        salesQuotations: true,
        ordersProduction: false,
        financeCollections: false,
        userManagement: false,
        masterData: false,
        reportsAnalytics: true,
        customerPortalAccess: true,
      });
    } else if (preset === 'tech') {
      setNewPermissions({
        overview: true,
        technicalOffice: true,
        costingPricing: false,
        salesQuotations: false,
        ordersProduction: true,
        financeCollections: false,
        userManagement: false,
        masterData: true,
        reportsAnalytics: true,
        customerPortalAccess: false,
      });
    } else if (preset === 'costing') {
      setNewPermissions({
        overview: true,
        technicalOffice: true,
        costingPricing: true,
        salesQuotations: true,
        ordersProduction: false,
        financeCollections: false,
        userManagement: false,
        masterData: true,
        reportsAnalytics: true,
        customerPortalAccess: false,
      });
    }
  };

  // Handle Submit New User
  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName || !newEmail || !newUserName) {
      alert('Please fill in all required fields.');
      return;
    }

    const createdUser: Omit<UserAccount, 'id'> = {
      userType: newUserType,
      fullName: newFullName,
      userName: newUserName,
      email: newEmail,
      department: newUserType === 'customer' ? `Customer - ${newCompanyName || 'Client'}` : newDepartment,
      companyName: newUserType === 'customer' ? newCompanyName : undefined,
      customerCode: newUserType === 'customer' ? newCustomerCode || `CUST-${Date.now().toString().slice(-4)}` : undefined,
      role: newRole,
      status: newStatus,
      permissions:
        newUserType === 'customer'
          ? {
              overview: false,
              technicalOffice: false,
              costingPricing: false,
              salesQuotations: false,
              ordersProduction: false,
              financeCollections: false,
              userManagement: false,
              masterData: false,
              reportsAnalytics: false,
              customerPortalAccess: true,
            }
          : newPermissions,
    };

    addUser(createdUser);
    setIsAddUserModalOpen(false);
  };

  // Handle Edit User Permissions Toggle
  const handleToggleUserPermission = (userId: string, permKey: keyof ModulePermissions) => {
    const user = usersList.find((u) => u.id === userId);
    if (!user) return;
    const updatedPerms = { ...user.permissions, [permKey]: !user.permissions[permKey] };
    updateUser(userId, { permissions: updatedPerms });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-brand-600 rounded-2xl p-5 text-white border border-brand-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-red-300 uppercase tracking-widest bg-red-800/60 px-2.5 py-1 rounded-md border border-red-600/40">
            SECURITY, USER PROVISIONING & RBAC MATRIX
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1">
            Role-Based Access Control & User Administration
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            Manage user accounts, provision customer accounts, assign department roles, and configure granular module permissions.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleOpenAddUserModal}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold text-xs shadow-lg transition-all flex items-center space-x-1.5"
          >
            <UserPlus className="h-4 w-4" />
            <span>+ Add New User (Internal or Customer)</span>
          </button>
        </div>
      </div>

      {/* Tabs bar & Search filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-lg border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        {/* Navigation Tabs */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveTab('users_list')}
            className={`px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all ${
              activeTab === 'users_list'
                ? 'bg-red-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <Users className="h-4 w-4" />
            <span>User Accounts Directory ({usersList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('rbac_matrix')}
            className={`px-4 py-2 rounded-xl font-bold flex items-center space-x-2 transition-all ${
              activeTab === 'rbac_matrix'
                ? 'bg-red-600 text-white shadow'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>RBAC Module Permission Matrix</span>
          </button>
        </div>

        {/* Search & Filters */}
        {activeTab === 'users_list' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search user, email, role, or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs font-semibold outline-none focus:ring-2 focus:ring-red-500 w-52 sm:w-64"
              />
            </div>

            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value as any)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold outline-none"
            >
              <option value="all">Type: All Accounts</option>
              <option value="internal">Type: Internal Staff Only</option>
              <option value="customer">Type: Customer Accounts Only</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold outline-none"
            >
              <option value="all">Status: All</option>
              <option value="Active">Status: Active</option>
              <option value="Inactive">Status: Inactive</option>
              <option value="Pending Approval">Status: Pending</option>
            </select>
          </div>
        )}
      </div>

      {/* VIEW 1: USER ACCOUNTS DIRECTORY LIST */}
      {activeTab === 'users_list' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800 text-xs">
            <h3 className="font-bold text-slate-900 dark:text-white">
              System Accounts Directory ({filteredUsers.length} shown)
            </h3>
            <span className="text-slate-400 font-medium">
              Click "Edit RBAC" to modify module permissions or status for any account.
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3">User Name & Details</th>
                  <th className="p-3">Account Category</th>
                  <th className="p-3">Company / Department</th>
                  <th className="p-3">Role Title</th>
                  <th className="p-3">Assigned Permissions</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium text-slate-800 dark:text-slate-200">
                {filteredUsers.map((u) => {
                  const activePermsCount = Object.values(u.permissions || {}).filter(Boolean).length;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${
                              u.userType === 'customer'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            }`}
                          >
                            {u.fullName.charAt(0)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">
                              {u.fullName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono block">
                              {u.userName} • {u.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        {u.userType === 'customer' ? (
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 inline-flex items-center">
                            <Building2 className="h-3 w-3 mr-1" />
                            Customer Account
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700 inline-flex items-center">
                            <Lock className="h-3 w-3 mr-1" />
                            Internal Staff
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-semibold text-slate-700 dark:text-slate-300">
                        {u.companyName || u.department}
                        {u.customerCode && (
                          <span className="block text-[10px] font-mono text-slate-400">
                            {u.customerCode}
                          </span>
                        )}
                      </td>

                      <td className="p-3 font-semibold text-red-600 dark:text-red-400">{u.role}</td>

                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                          {activePermsCount} Module(s) Granted
                        </span>
                      </td>

                      <td className="p-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                            u.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : u.status === 'Pending Approval'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>

                      <td className="p-3 text-right space-x-1">
                        <button
                          onClick={() => setEditingUser(u)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-[10px] text-slate-700 dark:text-slate-300 transition-colors"
                        >
                          Edit RBAC
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Are you sure you want to delete user ${u.fullName}?`)) {
                              deleteUser(u.id);
                            }
                          }}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors inline-block"
                          title="Delete User"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 2: RBAC MODULE PERMISSION MATRIX GRID */}
      {activeTab === 'rbac_matrix' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-red-600" />
                <span>Live Role-Based Access Control (RBAC) Permissions Grid</span>
              </h3>
              <p className="text-slate-500 text-[11px] mt-0.5">
                Toggle permission checkboxes directly on individual user accounts to grant or restrict access instantly.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="p-3 min-w-[200px]">User Account & Role</th>
                  {MODULE_KEYS.map((m) => (
                    <th key={m.key} className="p-2 text-center text-[10px] min-w-[100px]">
                      <span className="block text-sm">{m.icon}</span>
                      <span>{m.label}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-medium">
                {usersList.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-3">
                      <span className="font-bold text-slate-900 dark:text-white block">{u.fullName}</span>
                      <span className="text-[10px] text-slate-500 font-semibold block">{u.role}</span>
                    </td>

                    {MODULE_KEYS.map((m) => {
                      const isGranted = !!u.permissions?.[m.key];
                      return (
                        <td key={m.key} className="p-2 text-center">
                          <button
                            onClick={() => handleToggleUserPermission(u.id, m.key)}
                            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all ${
                              isGranted
                                ? 'bg-emerald-500 text-white shadow-sm hover:bg-emerald-600'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 hover:bg-slate-300 dark:hover:bg-slate-700'
                            }`}
                            title={`Toggle ${m.label} for ${u.fullName}`}
                          >
                            {isGranted ? <Check className="h-4 w-4" /> : <X className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: ADD NEW USER (Internal or Customer) */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-brand-600 p-5 text-white border-b border-brand-700 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-red-300 uppercase tracking-widest bg-red-900/60 px-2.5 py-0.5 rounded-full border border-red-700">
                  NEW USER PROVISIONING
                </span>
                <h2 className="text-xl font-black tracking-tight mt-1">Add System User Account</h2>
              </div>
              <button
                onClick={() => setIsAddUserModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateUserSubmit} className="p-6 overflow-y-auto space-y-5 text-xs flex-1">
              {/* User Type Selector Toggle */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Account Type Category
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setNewUserType('internal');
                      applyPermissionPreset('sales');
                    }}
                    className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 border transition-all ${
                      newUserType === 'internal'
                        ? 'bg-red-600 text-white border-red-600 shadow'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Lock className="h-4 w-4" />
                    <span>Internal Staff Account</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewUserType('customer');
                      applyPermissionPreset('customer');
                    }}
                    className={`py-3 px-4 rounded-xl font-bold flex items-center justify-center space-x-2 border transition-all ${
                      newUserType === 'customer'
                        ? 'bg-blue-600 text-white border-blue-600 shadow'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <Building2 className="h-4 w-4" />
                    <span>Customer Account</span>
                  </button>
                </div>
              </div>

              {/* Name & Username */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Eng. Hassan Al-Sayed"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Username / ID *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. h.sayed"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Email & Role Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. h.sayed@energya.com or hassan@client.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Lead Cable Design Engineer or Procurement Director"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Department or Customer Details */}
              {newUserType === 'internal' ? (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Internal Department
                  </label>
                  <select
                    value={newDepartment}
                    onChange={(e) => setNewDepartment(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <option value="Sales & Commercial">Sales & Commercial</option>
                    <option value="Technical Office">Technical Office</option>
                    <option value="Costing & Pricing">Costing & Pricing</option>
                    <option value="Plant Production">Plant Production</option>
                    <option value="Finance & Accounts">Finance & Accounts</option>
                    <option value="IT Administration">IT Administration</option>
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Customer Company Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Saudi Electricity Company"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Customer ERP Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CUST-SEC-991"
                      value={newCustomerCode}
                      onChange={(e) => setNewCustomerCode(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Module Permissions Checklist (for internal users) */}
              {newUserType === 'internal' && (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-900 dark:text-white">
                      RBAC Module Permissions Setup
                    </label>

                    <div className="flex items-center space-x-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => applyPermissionPreset('all')}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold"
                      >
                        Grant All
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPermissionPreset('tech')}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold"
                      >
                        Tech Preset
                      </button>
                      <button
                        type="button"
                        onClick={() => applyPermissionPreset('costing')}
                        className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 font-bold"
                      >
                        Costing Preset
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                    {MODULE_KEYS.map((m) => (
                      <label key={m.key} className="flex items-center space-x-2 cursor-pointer font-medium">
                        <input
                          type="checkbox"
                          checked={!!newPermissions[m.key]}
                          onChange={(e) =>
                            setNewPermissions({ ...newPermissions, [m.key]: e.target.checked })
                          }
                          className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                        />
                        <span>
                          {m.icon} {m.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-extrabold shadow-lg transition-all flex items-center space-x-1.5"
                >
                  <Plus className="h-4 w-4" />
                  <span>Provision Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT USER PERMISSIONS */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden relative p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold text-purple-600 uppercase">EDIT USER PERMISSIONS</span>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mt-0.5">
                  {editingUser.fullName} ({editingUser.role})
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="font-bold text-slate-900 dark:text-white block">
                Toggle Module Access Permissions:
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                {MODULE_KEYS.map((m) => {
                  const isGranted = !!editingUser.permissions?.[m.key];
                  return (
                    <label key={m.key} className="flex items-center space-x-2 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        checked={isGranted}
                        onChange={() => {
                          const updated = {
                            ...editingUser.permissions,
                            [m.key]: !isGranted,
                          };
                          updateUser(editingUser.id, { permissions: updated });
                          setEditingUser({ ...editingUser, permissions: updated });
                        }}
                        className="w-4 h-4 rounded text-red-600 focus:ring-red-500"
                      />
                      <span>
                        {m.icon} {m.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setEditingUser(null)}
                className="px-5 py-2 rounded-xl bg-red-600 text-white font-bold"
              >
                Done / Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
