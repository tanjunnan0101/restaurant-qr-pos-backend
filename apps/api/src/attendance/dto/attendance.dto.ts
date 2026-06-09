import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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
const attendanceShiftStatuses = ['SCHEDULED', 'CANCELLED', 'COMPLETED'] as const;

export class ClockAttendanceDto {
  @ApiPropertyOptional({
    description:
      'Optional target staff user when attendance is captured from a shared station.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  userId?: string;

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
      'Optional scheduled shift linked to this clock event when using the shared timetable.',
  })
  @IsOptional()
  @IsUUID()
  scheduledShiftId?: string;

  @ApiPropertyOptional({
    description:
      'Temporary proof payload. Accepts an image data URL or hosted image URL.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000000)
  photoDataUrl?: string;
}

export class GetAttendanceCurrentQueryDto {
  @ApiPropertyOptional({
    description:
      'Optional target staff user when reviewing attendance from a shared station.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  userId?: string;
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

export class ListAttendanceShiftsQueryDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({ enum: attendanceShiftStatuses })
  @IsOptional()
  @IsIn(attendanceShiftStatuses)
  status?: (typeof attendanceShiftStatuses)[number];
}

export class CreateAttendanceShiftDto {
  @ApiProperty({
    description: 'Assigned staff member for the shift.',
  })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: 'Lunch counter' })
  @IsString()
  @Length(2, 120)
  title!: string;

  @ApiPropertyOptional({ example: 'Front counter iPad' })
  @IsOptional()
  @IsString()
  @Length(0, 160)
  stationLabel?: string;

  @ApiPropertyOptional({ example: 'Cover lunch handoff and cashier open.' })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @ApiProperty({
    description: 'UTC ISO shift start timestamp.',
  })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({
    description: 'UTC ISO shift end timestamp.',
  })
  @IsDateString()
  endsAt!: string;
}

export class CancelAttendanceShiftDto {
  @ApiProperty({ example: 'Roster changed for today.' })
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
