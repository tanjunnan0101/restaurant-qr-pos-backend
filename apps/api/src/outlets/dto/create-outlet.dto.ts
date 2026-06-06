import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateOutletDto {
  @ApiProperty({ example: 'Orchard Outlet' })
  @IsString()
  @Length(2, 160)
  name!: string;

  @ApiProperty({ example: 'orchard' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;

  @ApiPropertyOptional({ default: 'Asia/Singapore' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ default: 'SGD' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  gstEnabled?: boolean;

  @ApiPropertyOptional({ default: 900 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  gstRateBps?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  serviceChargeEnabled?: boolean;

  @ApiPropertyOptional({ default: 1000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  serviceChargeBps?: number;
}
