import { IsOptional, IsString, Length } from 'class-validator';

export class CreateServiceRequestDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}

export class ResolveServiceRequestDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;
}
