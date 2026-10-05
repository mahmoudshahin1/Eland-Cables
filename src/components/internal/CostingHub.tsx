import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { CostingWorkspaceShell } from '../costing/v3/CostingWorkspaceShell';

export const CostingHub: React.FC = () => {
  const { jwtToken } = useAuth();
  return <CostingWorkspaceShell token={jwtToken} />;
};
