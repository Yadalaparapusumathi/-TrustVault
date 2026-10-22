/** DTOs exactly matching docs/API.md. ISO-8601 timestamps are typed as `string`. */

export type Uuid = string;
export type IsoDateTime = string;
/** `yyyy-MM-dd` */
export type IsoDate = string;

export type Role = 'ADMIN' | 'OWNER' | 'VIEWER';
export type Classification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED';
export type Permission = 'READ' | 'EDIT';
export type MyPermission = 'OWNER' | 'EDIT' | 'READ';
export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILURE';
export type GrantSource = 'MANUAL' | 'SUGGESTION';
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'DISMISSED';
export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type DocumentScope = 'all' | 'owned' | 'shared' | 'trash';
export type DocumentSortField = 'name' | 'createdAt' | 'updatedAt' | 'sizeBytes';
export type SortDirection = 'asc' | 'desc';

export const CLASSIFICATIONS: readonly Classification[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
export const ROLES: readonly Role[] = ['ADMIN', 'OWNER', 'VIEWER'];
export const PERMISSIONS: readonly Permission[] = ['READ', 'EDIT'];
export const AUDIT_OUTCOMES: readonly AuditOutcome[] = ['SUCCESS', 'DENIED', 'FAILURE'];

export interface UserSummary {
  id: Uuid;
  username: string;
  displayName: string;
  role: Role;
}

export interface Me extends UserSummary {
  email: string | null;
  mustChangePassword: boolean;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface DocumentSummary {
  id: Uuid;
  name: string;
  category: string;
  classification: Classification;
  owner: UserSummary;
  myPermission: MyPermission;
  currentVersion: number;
  sizeBytes: number;
  contentType: string;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
  purgeAfter: IsoDateTime | null;
}

export interface DocumentDetail extends DocumentSummary {
  description: string | null;
  originalFilename: string;
  sha256: string;
  /** Optimistic-lock token, send back on PATCH. */
  lockVersion: number;
}

export interface Version {
  versionNo: number;
  sizeBytes: number;
  contentType: string;
  originalFilename: string;
  sha256: string;
  uploadedBy: UserSummary;
  createdAt: IsoDateTime;
}

export interface Grant {
  id: Uuid;
  grantee: UserSummary;
  permission: Permission;
  grantedBy: UserSummary;
  createdAt: IsoDateTime;
  expiresAt: IsoDateTime | null;
  source: GrantSource;
}

export interface Suggestion {
  id: Uuid;
  user: UserSummary;
  permission: Permission;
  /** 0..1 */
  score: number;
  reasons: string[];
  status: SuggestionStatus;
}

export interface AuditActor {
  id: Uuid;
  username: string;
  role: string;
}

export interface AuditEvent {
  seq: number;
  occurredAt: IsoDateTime;
  /** null = system */
  actor: AuditActor | null;
  action: string;
  outcome: AuditOutcome;
  targetType: string | null;
  targetId: string | null;
  documentId: Uuid | null;
  details: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}

export interface IntegrityReport {
  valid: boolean;
  checkedEvents: number;
  firstBrokenSeq: number | null;
  headSeq: number | null;
  headHash: string | null;
  verifiedAt: IsoDateTime;
  message: string;
}

export interface AdminUser extends UserSummary {
  email: string | null;
  active: boolean;
  lockedUntil: IsoDateTime | null;
  lastLoginAt: IsoDateTime | null;
  createdAt: IsoDateTime;
  ownedDocuments: number;
  activeSessions: number;
  mustChangePassword: boolean;
}

export interface DashboardTotals {
  users: number;
  activeUsers: number;
  documents: number;
  trashedDocuments: number;
  activeGrants: number;
  events24h: number;
  denied24h: number;
  downloads24h: number;
}

export interface DashboardAlert {
  severity: AlertSeverity;
  type: string;
  message: string;
  actor: UserSummary | null;
  count: number;
  since: IsoDateTime;
}

export interface ActivityDay {
  date: IsoDate;
  uploads: number;
  downloads: number;
  denied: number;
  permissionChanges: number;
}

export interface Dashboard {
  totals: DashboardTotals;
  alerts: DashboardAlert[];
  activityByDay: ActivityDay[];
  recentPermissionChanges: AuditEvent[];
  recentDenied: AuditEvent[];
  integrity: IntegrityReport;
}

// ---- Request bodies ----------------------------------------------------------

export interface LoginRequest {
  username: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface DocumentSearchParams {
  q?: string;
  owner?: string;
  category?: string;
  classification?: Classification;
  from?: IsoDate;
  to?: IsoDate;
  scope?: DocumentScope;
  page?: number;
  size?: number;
  /** e.g. `updatedAt,desc` */
  sort?: string;
}

export interface UploadDocumentRequest {
  file: File;
  name?: string;
  description?: string;
  category: string;
  classification?: Classification;
}

export interface UpdateDocumentRequest {
  name?: string;
  description?: string;
  category?: string;
  classification?: Classification;
  lockVersion: number;
}

export interface CreateGrantRequest {
  userId: Uuid;
  permission: Permission;
  expiresAt?: IsoDateTime;
  suggestionId?: Uuid;
}

export interface AuditSearchParams {
  actor?: string;
  action?: string;
  outcome?: AuditOutcome;
  documentId?: string;
  from?: IsoDate;
  to?: IsoDate;
  page?: number;
  size?: number;
}

export interface CreateUserRequest {
  username: string;
  displayName: string;
  email?: string;
  role: Role;
  temporaryPassword: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  email?: string;
  role?: Role;
  active?: boolean;
}

export interface ResetPasswordRequest {
  temporaryPassword: string;
}

export interface TransferDocumentsRequest {
  toUserId: Uuid;
}

export interface TransferDocumentsResponse {
  transferred: number;
}
