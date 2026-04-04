export interface AdminActionState {
  error: string | null;
  success: string | null;
}

export const INITIAL_ADMIN_ACTION_STATE: AdminActionState = {
  error: null,
  success: null,
};
