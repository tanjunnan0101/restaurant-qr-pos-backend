import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: 'Ji Dan Group' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @ApiPropertyOptional({ example: 'Ji Dan Private Limited' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @ApiPropertyOptional({ example: '202600123M' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'SGD' })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'Asia/Singapore' })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  defaultTimezone?: string;

  @ApiPropertyOptional({
    example: 'Updated business profile after incorporation details changed.',
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
