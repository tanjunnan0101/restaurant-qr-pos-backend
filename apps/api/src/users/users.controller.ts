import { Body, Controller, Get, Ip, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import type { AuthenticatedUser } from '../common/types/authenticated-user';
import { CreateStaffUserDto } from './dto/create-staff-user.dto';
import { RemoveStaffAccessDto } from './dto/remove-staff-access.dto';
import { ReissueStaffActivationDto } from './dto/reissue-staff-activation.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('admin/outlets/:outletId/staff')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Permissions('user.manage')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.users.listOutletStaff(user, outletId);
  }

  @Get('roles')
  @Permissions('user.manage')
  roles(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
  ) {
    return this.users.listAssignableRoles(user, outletId);
  }

  @Post()
  @Permissions('user.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Body() dto: CreateStaffUserDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.users.createStaffUser(
      user,
      outletId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post(':userId/role')
  @Permissions('user.manage')
  updateRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateStaffRoleDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.users.updateOutletRole(
      user,
      outletId,
      userId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post(':userId/reissue-activation')
  @Permissions('user.manage')
  reissueActivation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('userId') userId: string,
    @Body() dto: ReissueStaffActivationDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.users.reissueActivation(
      user,
      outletId,
      userId,
      dto,
      request.id,
      ipAddress,
    );
  }

  @Post(':userId/remove-access')
  @Permissions('user.manage')
  removeAccess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('outletId') outletId: string,
    @Param('userId') userId: string,
    @Body() dto: RemoveStaffAccessDto,
    @Req() request: Request & { id?: string },
    @Ip() ipAddress: string,
  ) {
    return this.users.removeOutletAccess(
      user,
      outletId,
      userId,
      dto,
      request.id,
      ipAddress,
    );
  }
}
