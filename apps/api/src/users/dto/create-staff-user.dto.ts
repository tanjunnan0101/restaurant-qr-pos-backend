import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, Length } from 'class-validator';

const assignableRoleKeys = ['MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] as const;

export class CreateStaffUserDto {
  @ApiProperty({ example: 'cashier@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Front Counter Cashier' })
  @IsString()
  @Length(2, 160)
  fullName!: string;

  @ApiProperty({ enum: assignableRoleKeys, example: 'CASHIER' })
  @IsIn(assignableRoleKeys)
  roleKey!: (typeof assignableRoleKeys)[number];
}
