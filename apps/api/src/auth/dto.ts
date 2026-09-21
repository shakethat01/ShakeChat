import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(3) @MaxLength(32) username!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class LoginDto {
  @IsString() login!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(48) displayName?: string;
  @IsOptional() @IsString() @MaxLength(500) avatarUrl?: string;
  @IsOptional() @IsString() @MaxLength(96) statusText?: string;
  @IsOptional() @IsIn(['AVAILABLE', 'FOCUS', 'AWAY']) profileMode?: 'AVAILABLE' | 'FOCUS' | 'AWAY';
}

export class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(128) currentPassword!: string;
  @IsString() @MinLength(8) @MaxLength(128) newPassword!: string;
}

export class UpdatePrivacyDto {
  @IsOptional() @IsIn(['EVERYONE', 'SHARED_SERVERS', 'NOBODY']) friendRequestPolicy?: 'EVERYONE' | 'SHARED_SERVERS' | 'NOBODY';
  @IsOptional() @IsBoolean() allowGroupDmInvites?: boolean;
}
