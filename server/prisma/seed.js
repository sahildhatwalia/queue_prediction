import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // ─── DEPARTMENTS ─────────────────────────────────────────────────────────────
  const departments = await Promise.all([
    prisma.department.upsert({
      where: { code: 'GOPD' },
      update: {},
      create: { name: 'General OPD', code: 'GOPD', floor: 1, averageServiceMin: 12, maxCapacity: 50 },
    }),
    prisma.department.upsert({
      where: { code: 'CARD' },
      update: {},
      create: { name: 'Cardiology', code: 'CARD', floor: 2, averageServiceMin: 20, maxCapacity: 30 },
    }),
    prisma.department.upsert({
      where: { code: 'ORTHO' },
      update: {},
      create: { name: 'Orthopaedics', code: 'ORTHO', floor: 3, averageServiceMin: 18, maxCapacity: 25 },
    }),
    prisma.department.upsert({
      where: { code: 'DERM' },
      update: {},
      create: { name: 'Dermatology', code: 'DERM', floor: 2, averageServiceMin: 10, maxCapacity: 20 },
    }),
    prisma.department.upsert({
      where: { code: 'NEURO' },
      update: {},
      create: { name: 'Neurology', code: 'NEURO', floor: 4, averageServiceMin: 25, maxCapacity: 20 },
    }),
    prisma.department.upsert({
      where: { code: 'EMRG' },
      update: {},
      create: { name: 'Emergency', code: 'EMRG', floor: 0, averageServiceMin: 30, maxCapacity: 15 },
    }),
    prisma.department.upsert({
      where: { code: 'PEDI' },
      update: {},
      create: { name: 'Paediatrics', code: 'PEDI', floor: 1, averageServiceMin: 15, maxCapacity: 25 },
    }),
    prisma.department.upsert({
      where: { code: 'ENT' },
      update: {},
      create: { name: 'ENT', code: 'ENT', floor: 2, averageServiceMin: 12, maxCapacity: 20 },
    }),
  ]);
  console.log(`✅ Seeded ${departments.length} departments`);

  // ─── SUPER ADMIN ─────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin@12345', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@hospital.com' },
    update: {},
    create: {
      email: 'admin@hospital.com',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      firstName: 'Hospital',
      lastName: 'Admin',
      isEmailVerified: true,
    },
  });
  console.log(`✅ Seeded super admin: ${admin.email}`);

  // ─── RECEPTIONIST ────────────────────────────────────────────────────────────
  const receptionistHash = await bcrypt.hash('Staff@12345', 12);
  const receptionist = await prisma.user.upsert({
    where: { email: 'reception@hospital.com' },
    update: {},
    create: {
      email: 'reception@hospital.com',
      passwordHash: receptionistHash,
      role: 'RECEPTIONIST',
      firstName: 'Front',
      lastName: 'Desk',
      isEmailVerified: true,
    },
  });
  await prisma.staffProfile.upsert({
    where: { userId: receptionist.id },
    update: {},
    create: {
      userId: receptionist.id,
      position: 'Receptionist',
    },
  });
  console.log(`✅ Seeded receptionist: ${receptionist.email}`);

  // ─── DOCTORS ─────────────────────────────────────────────────────────────────
  const cardiology = departments.find((d) => d.code === 'CARD');
  const generalOpd = departments.find((d) => d.code === 'GOPD');

  const doctorHash = await bcrypt.hash('Doctor@12345', 12);

  const doctor1 = await prisma.user.upsert({
    where: { email: 'dr.sharma@hospital.com' },
    update: {},
    create: {
      email: 'dr.sharma@hospital.com',
      passwordHash: doctorHash,
      role: 'DOCTOR',
      firstName: 'Rajesh',
      lastName: 'Sharma',
      isEmailVerified: true,
    },
  });
  await prisma.doctorProfile.upsert({
    where: { userId: doctor1.id },
    update: {},
    create: {
      userId: doctor1.id,
      departmentId: cardiology.id,
      specialization: 'Interventional Cardiology',
      licenseNumber: 'MCI-CARD-001',
      avgConsultMin: 15,
    },
  });

  const doctor2 = await prisma.user.upsert({
    where: { email: 'dr.patel@hospital.com' },
    update: {},
    create: {
      email: 'dr.patel@hospital.com',
      passwordHash: doctorHash,
      role: 'DOCTOR',
      firstName: 'Anita',
      lastName: 'Patel',
      isEmailVerified: true,
    },
  });
  await prisma.doctorProfile.upsert({
    where: { userId: doctor2.id },
    update: {},
    create: {
      userId: doctor2.id,
      departmentId: generalOpd.id,
      specialization: 'General Medicine',
      licenseNumber: 'MCI-GOPD-001',
      avgConsultMin: 10,
    },
  });
  console.log('✅ Seeded 2 doctors');

  // ─── COUNTERS ─────────────────────────────────────────────────────────────────
  for (const dept of departments.slice(0, 4)) {
    for (let i = 1; i <= 2; i++) {
      await prisma.counter.create({
        data: { departmentId: dept.id, name: `Counter ${i}` },
      }).catch(() => {}); // ignore if already exists
    }
  }
  console.log('✅ Seeded counters');

  // ─── DEMO PATIENT ─────────────────────────────────────────────────────────────
  const patientHash = await bcrypt.hash('Patient@12345', 12);
  await prisma.user.upsert({
    where: { email: 'patient@example.com' },
    update: {},
    create: {
      email: 'patient@example.com',
      phone: '+919876543210',
      passwordHash: patientHash,
      role: 'PATIENT',
      firstName: 'Demo',
      lastName: 'Patient',
      dateOfBirth: new Date('1990-05-15'),
      gender: 'male',
      bloodGroup: 'O+',
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });
  console.log('✅ Seeded demo patient');

  console.log('\n🎉 Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Super Admin:   admin@hospital.com     / Admin@12345');
  console.log('  Receptionist:  reception@hospital.com / Staff@12345');
  console.log('  Doctor:        dr.sharma@hospital.com / Doctor@12345');
  console.log('  Patient:       patient@example.com   / Patient@12345');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
