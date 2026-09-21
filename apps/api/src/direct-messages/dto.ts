import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SendDirectMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  replyToId?: string;
}

export class EditDirectMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}

export class DirectReactionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}

export class CreateGroupDmDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  title?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(8)
  @IsString({ each: true })
  memberIds!: string[];
}
