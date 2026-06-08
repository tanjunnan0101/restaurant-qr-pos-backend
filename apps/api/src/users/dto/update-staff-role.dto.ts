import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Length } from 'class-validator';

const assignableRoleKeys = ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;

export class UpdateStaffRoleDto {
  @ApiProperty({ enum: assignableRoleKeys, example: 'WAITER' })
  @IsIn(assignableRoleKeys)
  roleKey!: (typeof assignableRoleKeys)[number];

  @ApiProperty({ example: 'Moved from cashier to floor service.' })
  @IsString()
  @Length(3, 500)
  reason!: string;
}
