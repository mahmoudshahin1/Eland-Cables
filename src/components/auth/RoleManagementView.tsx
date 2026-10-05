import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Plus, Check, X, Lock, Users, Briefcase, Building, Key } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ModulePermissions, UserAccount } from '../../types';

export const RoleManagementView: React.FC = () => {
  const { rolesList, usersList, assignUserRole, createNewRole, currentUser } = useAuth();
  
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleType, setNewRoleType] = useState<'customer' | 'internal'>('internal');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingUserRole, setEditingUserRole] = useState<string>('');

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

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName) return;

    const success = await createNewRole({
      name: newRoleName,
      description: newRoleDesc,
      userType: newRoleType,
      defaultPermissions: newPermissions,
    });

    if (success) {
      setIsCreateRoleModalOpen(false);
      setNewRoleName('');
      setNewRoleDesc('');
    }
  };

  const handleAssignRoleSubmit = async (userId: string) => {
    if (!editingUserRole) return;
    await assignUserRole(userId, editingUserRole);
    setEditingUserId(null);
  };

  return (
    <div className="space-y-6 text-xs animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-5 rounded-2xl border border-indigo-900/60 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="h-5 w-5 text-indigo-400" />
            <h3 className="font-extrabold text-base text-white">.NET 9 RBAC Role Management</h3>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] px-2 py-0.5 rounded-full font-mono">
              SQL Server AspNetRoles
            </span>
          </div>
          <p className="text-slate-300 text-xs mt-1">
            Manage system roles, assign JWT claim permissions, and configure user access matrix across modules.
          </p>
        </div>

        <button
          onClick={() => setIsCreateRoleModalOpen(true)}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg flex items-center justify-center space-x-2 transition-all shrink-0"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Role</span>
        </button>
      </div>

      {/* Roles Grid */}
      <div className="space-y-3">
        <h4 className="font-bold text-slate-300 uppercase tracking-wider text-[11px] flex items-center justify-between">
          <span>Active Role Definitions ({rolesList.length})</span>
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {rolesList.map((role) => (
            <div
              key={role.id}
              className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3 hover:border-slate-700 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white text-sm">{role.name}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                        role.userType === 'customer'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      {role.userType.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs mt-0.5">{role.description}</p>
                </div>
              </div>

              {/* Module Permissions Badges */}
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-[10px] font-bold text-slate-500 block mb-1.5 uppercase">
                  Enabled Module Claims:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(role.defaultPermissions || {}).map(([key, enabled]) =>
                    enabled ? (
                      <span
                        key={key}
                        className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-lg text-[10px] font-medium flex items-center"
                      >
                        <Check className="h-2.5 w-2.5 mr-1 text-emerald-400" />
                        {key}
                      </span>
                    ) : null
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Role Assignment Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="h-4 w-4 text-blue-400" />
            <h4 className="font-bold text-white text-sm">User Role Assignments & Claims Matrix</h4>
          </div>
          <span className="text-slate-400 text-xs">{usersList.length} Total Users</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-[10px]">
                <th className="p-3">User & Organization</th>
                <th className="p-3">Type</th>
                <th className="p-3">Current Role</th>
                <th className="p-3">Department</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {usersList.map((user) => (
                <tr key={user.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="p-3 font-semibold text-white">
                    <div>{user.fullName}</div>
                    <div className="text-[11px] text-slate-400 font-normal">{user.email}</div>
                  </td>

                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        user.userType === 'customer'
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {user.userType.toUpperCase()}
                    </span>
                  </td>

                  <td className="p-3 font-medium text-amber-300">
                    {editingUserId === user.id ? (
                      <div className="flex items-center space-x-2">
                        <select
                          value={editingUserRole}
                          onChange={(e) => setEditingUserRole(e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-white rounded-lg p-1.5 text-xs outline-none"
                        >
                          {rolesList.map((r) => (
                            <option key={r.id} value={r.name}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignRoleSubmit(user.id)}
                          className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingUserId(null)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span>{user.role}</span>
                    )}
                  </td>

                  <td className="p-3 text-slate-300">{user.department}</td>

                  <td className="p-3 text-right">
                    <button
                      onClick={() => {
                        setEditingUserId(user.id);
                        setEditingUserRole(user.role);
                      }}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                    >
                      Change Role
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Role */}
      {isCreateRoleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-extrabold text-white text-sm">Create New Custom .NET 9 Role</h3>
              <button onClick={() => setIsCreateRoleModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateRole} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-300 mb-1">Role Name</label>
                <input
                  type="text"
                  required
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                  placeholder="e.g. Quality Assurance Lead"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Description</label>
                <input
                  type="text"
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="Describes role capabilities in SQL Server..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 mb-1">Target Account Type</label>
                <select
                  value={newRoleType}
                  onChange={(e) => setNewRoleType(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="internal">Internal Enterprise Staff</option>
                  <option value="customer">External B2B Customer</option>
                </select>
              </div>

              <div className="pt-3 border-t border-slate-800">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  Save & Provision Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
