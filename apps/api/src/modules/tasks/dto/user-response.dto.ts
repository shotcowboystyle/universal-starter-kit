import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    description: 'The unique identifier of the user',
    example: '507f1f77bcf86cd799439011',
  })
  _id: string;

  @ApiProperty({
    description: 'The name of the user',
    example: 'John Doe',
  })
  name?: string | null;

  @ApiProperty({
    description: 'The email of the user',
    example: 'john@example.com',
  })
  email?: string;
}
