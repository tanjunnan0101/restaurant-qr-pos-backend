import { IsOptional, IsString, Length } from 'class-validator';

export class PrinterAgentHeartbeatDto {
  @IsOptional()
  @IsString()
  @Length(1, 40)
  appVersion?: string;
}

export class PrinterJobResultDto {
  @IsOptional()
  @IsString()
  @Length(1, 1000)
  message?: string;
}
