import { IsString, Length } from 'class-validator';

/**
 * `role` e string liber, validat NUMAI pentru format aici — valorile
 * valide (ex. `invoicing:issuer`) sunt definite de fiecare modul în
 * propriul fișier de specificație (docs/invoicing-spec.md etc.), nu în
 * acest DTO generic, ca users/ să rămână independent de orice modul de
 * business (regula #2 din CLAUDE.md).
 */
export class AssignModuleRoleDto {
  @IsString()
  @Length(1, 64)
  moduleCode!: string;

  @IsString()
  @Length(1, 64)
  role!: string;
}
