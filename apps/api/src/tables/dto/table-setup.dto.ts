import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DiningTableShape, DiningTableStatus } from '@restaurant-pos/db';

export class DiningTableSetupDto {
  @Matches(/^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/)
  tableCode!: string;

  @IsString()
  @Length(1, 120)
  displayName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  capacity?: number = 2;

  @IsOptional()
  @IsEnum(DiningTableShape)
  shape?: DiningTableShape = DiningTableShape.SQUARE;

  @IsOptional()
  @IsEnum(DiningTableStatus)
  status?: DiningTableStatus = DiningTableStatus.AVAILABLE;

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;
}

export class DiningZoneSetupDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DiningTableSetupDto)
  tables!: DiningTableSetupDto[];
}

export class SetupDiningTablesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DiningZoneSetupDto)
  zones!: DiningZoneSetupDto[];

  @IsOptional()
  @IsBoolean()
  rotateExistingQr?: boolean = false;
}

export class RotateTableQrDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class UpdateDiningTableStatusDto {
  @IsEnum(DiningTableStatus)
  status!: DiningTableStatus;

  @IsString()
  @Length(3, 500)
  reason!: string;
}
