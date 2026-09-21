import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
export class CreateServerDto { @IsString() @MinLength(2) name!: string; }
export class BanServerMemberDto { @IsOptional() @IsString() @MaxLength(240) reason?: string; }

export class RestrictServerMemberDto { @IsInt() @Min(1) @Max(10080) durationMinutes!: number; @IsOptional() @IsString() @MaxLength(240) reason?: string; }
