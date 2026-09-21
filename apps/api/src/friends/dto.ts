import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class SendFriendRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_.-]+$/, { message: 'Kullanıcı adı geçersiz.' })
  username!: string;
}
