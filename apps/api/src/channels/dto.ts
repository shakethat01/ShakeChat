import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateChannelDto {
  @IsString() @MinLength(1) @MaxLength(64) name!: string;
  @IsIn(['TEXT', 'VOICE']) type!: 'TEXT' | 'VOICE';
  @IsOptional() @IsString() @MaxLength(40) groupName?: string;
  @IsOptional() @IsInt() @Min(0) @Max(3600) slowModeSeconds?: number;
  @IsOptional() @IsBoolean() isLocked?: boolean;
}

export class UpdateChannelDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) name?: string;
  @IsOptional() @IsString() @MaxLength(40) groupName?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsInt() @Min(0) @Max(3600) slowModeSeconds?: number;
  @IsOptional() @IsBoolean() isLocked?: boolean;
}
