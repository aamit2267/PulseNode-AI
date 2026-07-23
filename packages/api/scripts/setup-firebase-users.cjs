#!/usr/bin/env node
/**
 * Firebase Test Users Setup Script
 *
 * This script creates all required test users in Firebase Authentication
 * for the PulseNode.ai test suite.
 *
 * Prerequisites:
 * 1. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in .env
 * 2. Run from packages/api directory: node setup-firebase-users.cjs
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const admin = require('firebase-admin');

// Initialize Firebase Admin
function initializeFirebase() {
  if (admin.apps.length > 0) {
    console.log('Firebase app already initialized');
    return admin.app();
  }

  console.log('Initializing Firebase...');
  console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET');
  console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET');
  console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET');
  console.log('FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT ? 'SET' : 'NOT SET');
  console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET');
  console.log('cwd:', process.cwd());
  console.log('__dirname:', __dirname);
  console.log('FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY:',
    process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY ? 'TRUE' : 'FALSE');

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    console.log('Using individual env vars for Firebase init');
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Using GOOGLE_APPLICATION_CREDENTIALS');
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  } else {
    console.log('ERROR: No Firebase credentials found!');
    console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET');
    console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? 'SET' : 'NOT SET');
    console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? 'SET' : 'NOT SET');
    console.log('FIREBASE_SERVICE_ACCOUNT:', process.env.FIREBASE_SERVICE_ACCOUNT ? 'SET' : 'NOT SET');
    console.log('GOOGLE_APPLICATION_CREDENTIALS:', process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET');
    throw new Error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or individual env vars.');
  }
}

// All test users needed
const testUsers = [
  // User specified by user
  { email: 'testuser@gmail.com', password: 'testuser', displayName: 'Test User' },

  // Platform admin
  { email: 'platform@pulsenode.ai', password: 'TestPass123!', displayName: 'Platform Admin' },

  // Company admins
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Acme Admin' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Admin' },
  { email: 'admin1@test.com', password: 'TestPass123!', displayName: 'Admin 1' },
  { email: 'admin2@test.com', password: 'TestPass123!', displayName: 'Admin 2' },

  // Doctors
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },

  // Doctor tests
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },

  // Doctor tests
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },

  // Doctor tests
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },

  // Doctor tests
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },

  // Doctor tests
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },

  // Doctor tests
  { email: 'dr.smith@example.com', password: 'TestPass123!', displayName: 'Dr. Smith' },
  { email: 'dr.dup@example.com', password: 'TestPass123!', displayName: 'Dr. Dup' },
  { email: 'pending@example.com', password: 'TestPass123!', displayName: 'Dr. Pending' },
  { email: 'approved@example.com', password: 'TestPass123!', displayName: 'Dr. Approved' },
  { email: 'offline@example.com', password: 'TestPass123!', displayName: 'Dr. Offline' },
  { email: 'clinic@example.com', password: 'TestPass123!', displayName: 'Dr. Clinic' },
  { email: 'both@example.com', password: 'TestPass123!', displayName: 'Dr. Both' },
  { email: 'profile@example.com', password: 'TestPass123!', displayName: 'Dr. Profile' },
  { email: 'update@example.com', password: 'TestPass123!', displayName: 'Dr. Update' },
  { email: 'edu@example.com', password: 'TestPass123!', displayName: 'Dr. Edu' },
  { email: 'lang@example.com', password: 'TestPass123!', displayName: 'Dr. Lang' },
  { email: 'avail@example.com', password: 'TestPass123!', displayName: 'Dr. Avail' },
  { email: 'search-a@example.com', password: 'TestPass123!', displayName: 'Dr. Search A' },
  { email: 'search-b@example.com', password: 'TestPass123!', displayName: 'Dr. Search B' },
  { email: 'search-c@example.com', password: 'TestPass123!', displayName: 'Dr. Search C' },
  { email: 'search-d@example.com', password: 'TestPass123!', displayName: 'Dr. Search D' },
  { email: 'admin-test@example.com', password: 'TestPass123!', displayName: 'Admin Test' },
  { email: 'approve@test.com', password: 'TestPass123!', displayName: 'Approve Me' },
  { email: 'suspend@test.com', password: 'TestPass123!', displayName: 'Suspend Me' },
  { email: 'doc@test.com', password: 'TestPass123!', displayName: 'Doc' },

  // Employees (for employee tests)
  { email: 'jane@acme.example.com', password: 'TestPass123!', displayName: 'Jane Doe' },
  { email: 'totpuser@acme.example.com', password: 'TestPass123!', displayName: 'TOTP User' },

  // Company maintainers
  { email: 'admin@acme.example.com', password: 'TestPass123!', displayName: 'Admin Maintainer' },
  { email: 'support@acme.example.com', password: 'TestPass123!', displayName: 'Support Maintainer' },
  { email: 'readonly@acme.example.com', password: 'TestPass123!', displayName: 'ReadOnly Maintainer' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared Maintainer' },
  { email: 'todelete@acme.example.com', password: 'TestPass123!', displayName: 'To Delete Maintainer' },
  { email: 'company@acme.example.com', password: 'TestPass123!', displayName: 'Company Maintainer' },

  // Invalid/test emails
  { email: 'invalid@example.com', password: 'TestPass123!', displayName: 'Invalid User' },
  { email: 'ok@acme.example.com', password: 'TestPass123!', displayName: 'OK User' },
  { email: 'shared@example.com', password: 'TestPass123!', displayName: 'Shared User' },
];

async function createUsers() {
  const app = initializeFirebase();
  const auth = admin.auth(app);

  console.log('Starting Firebase user creation...');
  console.log(`Total users to create: ${testUsers.length}\n`);

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of testUsers) {
    try {
      // Check if user already exists
      let userRecord;
      try {
        userRecord = await auth.getUserByEmail(user.email);
        console.log(`⏭️  Skipping ${user.email} (already exists: ${userRecord.uid})`);
        skipped++;
        continue;
      } catch (err) {
        // User doesn't exist, will create
        if (err.code !== 'auth/user-not-found') {
          throw err;
        }
      }

      // Create the user
      userRecord = await auth.createUser({
        email: user.email,
        password: user.password,
        displayName: user.displayName,
        emailVerified: true,
      });

      console.log(`✅ Created ${user.email} (${userRecord.uid})`);
      created++;

    } catch (err) {
      console.error(`❌ Failed to create ${user.email}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  process.exit(errors > 0 ? 1 : 0);
}

createUsers().catch(console.error);