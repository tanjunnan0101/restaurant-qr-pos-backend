import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class RemoveStaffAccessDto {
  @ApiProperty({
    example: 'Staff member moved to another outlet roster.',
  })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
