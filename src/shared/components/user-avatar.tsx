import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { getPublicUrl } from '@/shared/services/storage.service';
import { initials } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

interface UserAvatarProps {
  fullName: string | null | undefined;
  /** Path inside the `profile-photos` bucket. */
  avatarPath?: string | null;
  className?: string;
}

export function UserAvatar({ fullName, avatarPath, className }: UserAvatarProps) {
  const src = getPublicUrl('profile-photos', avatarPath);

  return (
    <Avatar className={cn('size-8', className)}>
      {src ? <AvatarImage src={src} alt={fullName ?? 'Profile photo'} /> : null}
      <AvatarFallback>{initials(fullName)}</AvatarFallback>
    </Avatar>
  );
}
