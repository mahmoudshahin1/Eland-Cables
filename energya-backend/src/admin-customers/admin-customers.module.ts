import { Module } from '@nestjs/common';
import { AdminCustomersRepository } from './admin-customers.repository.js';
import { AdminCustomersController } from './admin-customers.controller.js';
import { AdminCustomersService } from './admin-customers.service.js';

@Module({
  controllers: [AdminCustomersController],
  providers: [AdminCustomersService, AdminCustomersRepository],
})
export class AdminCustomersModule {}
