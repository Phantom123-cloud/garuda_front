import { redirect } from 'next/navigation';

// Direct login is no longer available.
// Workspace users must use their /ws/{slug} link.
// Platform admins use /platform/login.
export default function LoginPage() {
  redirect('/platform/login');
}
