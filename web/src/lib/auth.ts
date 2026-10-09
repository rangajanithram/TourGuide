export interface UserProfile {
  id: string; email: string; name: string;
  auth_provider: 'local' | 'google'; created_at: string;
}
