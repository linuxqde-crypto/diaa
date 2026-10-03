import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.enableCors({ origin: true, credentials: true });

  const swagger = new DocumentBuilder()
    .setTitle('KROTO API')
    .setDescription('متجر كروتو — واجهة برمجة بطاقات الهدايا المدفوعة بالعملات الرقمية')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}
bootstrap();
