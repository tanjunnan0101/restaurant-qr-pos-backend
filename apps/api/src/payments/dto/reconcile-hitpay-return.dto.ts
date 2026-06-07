import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class ReconcileHitPayReturnDto {
  @IsOptional()
  @IsUUID()
  reference?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  status?: string;
}
