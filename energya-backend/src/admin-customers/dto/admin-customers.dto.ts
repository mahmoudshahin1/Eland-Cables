import { IsString, IsNotEmpty, IsOptional, IsEnum, IsBoolean, IsArray } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  legalName?: string;

  @IsString()
  @IsOptional()
  countryCode?: string;

  @IsEnum(['STANDARD', 'GROUP', 'SUBSIDIARY', 'PROSPECT'])
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;
}

export class UpdateCustomerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  legalName?: string;

  @IsString()
  @IsOptional()
  countryCode?: string;

  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @IsEnum(['STANDARD', 'GROUP', 'SUBSIDIARY', 'PROSPECT'])
  @IsOptional()
  type?: string;
}

export class AssignCustomerUserDto {
  @IsString()
  @IsOptional()
  customerId?: string;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  userAccountId?: string;
}

export class UpdateCustomerUserDto {
  @IsEnum(['ACTIVE', 'INACTIVE'])
  @IsNotEmpty()
  status!: string;
}
