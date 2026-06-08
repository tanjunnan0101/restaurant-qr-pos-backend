import { PartialType } from '@nestjs/swagger';
import { CreateAdminOrderDto } from './create-admin-order.dto';

export class UpdateAdminOrderDto extends PartialType(CreateAdminOrderDto) {}
