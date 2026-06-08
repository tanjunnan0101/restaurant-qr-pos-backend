import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const attendanceSessionStatuses = ['CLOCKED_IN', 'CLOCKED_OUT'] as const;
const attendanceApprovalStatuses = [
  'PENDING',
  'APPROVED',
  'ADJUSTED',
  'FLAGGED',
] as const;

export class ClockAttendanceDto {
  @ApiPropertyOptional({ example: 'Front counter iPad' })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  deviceLabel?: string;

  @ApiPropertyOptional({ example: 'Started breakfast shift.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Temporary proof payload. Accepts an image data URL or hosted image URL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000000)
  photoDataUrl?: string;
}

export class ListAttendanceSessionsQueryDto {
  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ enum: attendanceSessionStatuses })
  @IsOptional()
  @IsIn(attendanceSessionStatuses)
  status?: (typeof attendanceSessionStatuses)[number];

  @ApiPropertyOptional({ enum: attendanceApprovalStatuses })
  @IsOptional()
  @IsIn(attendanceApprovalStatuses)
  approvalStatus?: (typeof attendanceApprovalStatuses)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 100)
  userId?: string;

  @ApiPropertyOptional({
    description: 'Inclusive UTC ISO timestamp.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Inclusive UTC ISO timestamp.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class UpdateAttendanceSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requirePhoto?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowManualClockIn?: boolean;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  maxShiftHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoFlagLateClockOut?: boolean;

  @ApiPropertyOptional({ example: 'Asia/Singapore' })
  @IsOptional()
  @IsString()
  @Length(3, 80)
  timezone?: string;

  @ApiProperty({ example: 'Updated attendance policy for launch week.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}

export class ApproveAttendanceSessionDto {
  @ApiPropertyOptional({ example: 'Manager reviewed shift record.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}

export class AdjustAttendanceSessionDto {
  @ApiPropertyOptional({
    description: 'UTC ISO timestamp used to override the recorded clock-in time.',
  })
  @IsOptional()
  @IsDateString()
  clockInAt?: string;

  @ApiPropertyOptional({
    description:
      'UTC ISO timestamp used to override the recorded clock-out time. Omit to keep session open.',
  })
  @IsOptional()
  @IsDateString()
  clockOutAt?: string;

  @ApiPropertyOptional({ example: 'Adjusted after manager review.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @ApiProperty({ example: 'Staff forgot to clock out before closing.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
