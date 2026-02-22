import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { printBanner } from './common/utils/banner';

async function bootstrap() {
  printBanner();
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
