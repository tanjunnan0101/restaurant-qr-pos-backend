import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class ReissueStaffActivationDto {
  @ApiProperty({ example: 'Staff member lost the original activation link.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
