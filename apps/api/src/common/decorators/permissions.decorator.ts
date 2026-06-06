import { SetMetadata } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../constants/metadata.constants';

export const Permissions = (...permissions: string[]): MethodDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
