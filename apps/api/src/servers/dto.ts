import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
export class CreateServerDto { @IsString() @MinLength(2) name!: string; }
export class TransferServerDto { @IsString() @MinLength(1) @MaxLength(128) userId!: string; }
export class DeleteServerDto { @IsString() @MinLength(1) confirmationName!: string; }
export class BanServerMemberDto { @IsOptional() @IsString() @MaxLength(240) reason?: string; }

export class RestrictServerMemberDto { @IsInt() @Min(1) @Max(10080) durationMinutes!: number; @IsOptional() @IsString() @MaxLength(240) reason?: string; }
