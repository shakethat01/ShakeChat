import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsString() @MaxLength(4000) content!: string;
  @IsOptional() @IsString() @MaxLength(128) replyToId?: string;
}

export class EditMessageDto {
  @IsString() @MinLength(1) @MaxLength(4000) content!: string;
}

export class ReactionDto {
  @IsString() @MinLength(1) @MaxLength(16) emoji!: string;
}

export class BulkDeleteMessagesDto {
  @IsInt() @Min(2) @Max(100) count!: number;
}
