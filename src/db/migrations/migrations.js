// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_odd_the_twelve.sql';
import m0001 from './0001_add_force_notification_ids.sql';
import m0002 from './0002_add_indexes.sql';
import m0003 from './0003_add_privacy_reminder_fields.sql';
import m0004 from './0004_add_protection_fields.sql';
import m0005 from './0005_add_medication_inventory.sql';
import m0006 from './0006_add_state_reward_tables.sql';
import m0007 from './0007_add_daycare.sql';
import m0008 from './0008_reminder_times_refactor.sql';
import m0009 from './0009_quantity_defaults_and_dev_crane.sql';

export default {
  journal,
  migrations: {
    m0000,
    m0001,
    m0002,
    m0003,
    m0004,
    m0005,
    m0006,
    m0007,
    m0008,
    m0009,
  }
}
