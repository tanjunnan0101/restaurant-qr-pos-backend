import { Type } from 'class-transformer';
import {
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
import { PrinterConnectionType, PrinterRole } from '@restaurant-pos/db';

export class KitchenStationSetupDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  key!: string;

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
}

export class PrinterSetupDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  key!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsEnum(PrinterConnectionType)
  connectionType!: PrinterConnectionType;

  @IsEnum(PrinterRole)
  role!: PrinterRole;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number = 9100;

  @IsOptional()
  @IsInt()
  @Min(48)
  @Max(112)
  paperWidthMm?: number = 80;

  @IsOptional()
  @IsBoolean()
  autoCut?: boolean = true;

  @IsOptional()
  @IsBoolean()
  buzzer?: boolean = false;

  @IsOptional()
  @IsBoolean()
  cashDrawer?: boolean = false;

  @IsOptional()
  @IsBoolean()
  active?: boolean = true;
}

export class PrinterRouteSetupDto {
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  stationKey!: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  primaryPrinterKey!: string;

  @IsOptional()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  backupPrinterKey?: string;
}

export class PrinterAgentSetupDto {
  @IsString()
  @Length(3, 120)
  deviceId!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsBoolean()
  rotateKey?: boolean = false;
}

export class SetupPrintersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KitchenStationSetupDto)
  stations!: KitchenStationSetupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrinterSetupDto)
  printers!: PrinterSetupDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrinterRouteSetupDto)
  routes!: PrinterRouteSetupDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PrinterAgentSetupDto)
  agent?: PrinterAgentSetupDto;
}

export class PrintReasonDto {
  @IsString()
  @Length(3, 500)
  reason!: string;
}
