import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { adminApi } from '@/api/admin';
import { queryKeys } from '@/api/queryKeys';
import type { AdminUser, AuditSearchParams, CreateUserRequest, Dashboard, UpdateUserRequest } from '@/api/types';

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.admin.dashboard,
    queryFn: ({ signal }) => adminApi.dashboard(signal),
    refetchInterval: 60_000,
  });
}

export function useVerifyIntegrity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => adminApi.verify(),
    onSuccess: (report) => {
      qc.setQueryData<Dashboard>(queryKeys.admin.dashboard, (prev) => (prev ? { ...prev, integrity: report } : prev));
      void qc.invalidateQueries({ queryKey: queryKeys.admin.auditAll });
      if (report.valid) toast.success(`Audit chain verified — ${report.checkedEvents.toLocaleString()} events`);
      else toast.error(`Tampering detected at seq ${report.firstBrokenSeq ?? '?'}`);
    },
  });
}

export function useAuditEvents(params: AuditSearchParams) {
  return useQuery({
    queryKey: queryKeys.admin.audit(params),
    queryFn: ({ signal }) => adminApi.audit(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAuditActions() {
  return useQuery({
    queryKey: queryKeys.admin.actions,
    queryFn: ({ signal }) => adminApi.auditActions(signal),
    staleTime: Infinity,
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: queryKeys.admin.users,
    queryFn: ({ signal }) => adminApi.users(signal),
  });
}

function useUsersInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.admin.users });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.dashboard });
    void qc.invalidateQueries({ queryKey: queryKeys.admin.auditAll });
  };
}

export function useCreateUser() {
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: (body: CreateUserRequest) => adminApi.createUser(body),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateUserRequest }) => adminApi.updateUser(id, body),
    onSuccess: (user) => {
      qc.setQueryData<AdminUser[]>(queryKeys.admin.users, (prev) => prev?.map((u) => (u.id === user.id ? user : u)));
      invalidate();
    },
  });
}

export function useResetPassword() {
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: ({ id, temporaryPassword }: { id: string; temporaryPassword: string }) =>
      adminApi.resetPassword(id, { temporaryPassword }),
    onSuccess: invalidate,
  });
}

export function useRevokeSessions() {
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: (user: AdminUser) => adminApi.revokeSessions(user.id),
    onSuccess: (_d, user) => {
      invalidate();
      toast.success(`All sessions of ${user.displayName} were revoked`);
    },
  });
}

export function useTransferDocuments() {
  const invalidate = useUsersInvalidation();
  return useMutation({
    mutationFn: ({ from, toUserId }: { from: AdminUser; toUserId: string }) => adminApi.transferDocuments(from.id, { toUserId }),
    onSuccess: invalidate,
  });
}
