import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

describe('CreateUserDto', () => {
  const base = {
    email: 'a@b.ro',
    password: 'parola1234',
    fullName: 'A B',
  };

  it('respinge role:"owner" — un owner nou se obține doar prin promovare, niciodată la creare (fix logic-reviewer)', async () => {
    const dto = plainToInstance(CreateUserDto, { ...base, role: 'owner' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'role')).toBe(true);
  });

  it('acceptă rolurile creabile (admin/accountant/operator)', async () => {
    for (const role of ['admin', 'accountant', 'operator']) {
      const dto = plainToInstance(CreateUserDto, { ...base, role });
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'role')).toBe(false);
    }
  });
});
