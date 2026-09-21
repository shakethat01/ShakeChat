import { Permission } from '@prisma/client';
import { ArrayUnique, IsArray, IsEnum, IsHexColor, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRoleDto {
  @IsString() @MinLength(1) @MaxLength(40) name!: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsArray() @ArrayUnique() @IsEnum(Permission, { each: true }) permissions!: Permission[];
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40) name?: string;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(Permission, { each: true }) permissions?: Permission[];
}

export class SetChannelOverrideDto {
  @IsArray() @ArrayUnique() @IsEnum(Permission, { each: true }) allow!: Permission[];
  @IsArray() @ArrayUnique() @IsEnum(Permission, { each: true }) deny!: Permission[];
}
