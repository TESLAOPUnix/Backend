const { Pool } = require("pg");
const cron = require("node-cron");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = new Pool({
  connectionString: process.env.DB_CONNECTION_STRING,
});

async function executeQuery(query, values = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    return result.rows;
  } finally {
    client.release();
  }
}

async function jobUpdate(jobIds) {
  const queryText =
    "UPDATE jb_jobs SET is_ok = TRUE, last_update = CURRENT_DATE WHERE id = $1";
  try {
    for (const jobId of jobIds) {
      const queryParams = [jobId];
      await executeQuery(queryText, queryParams);
    }
  } catch (error) {
    console.error("Error updating job status:", error);
  }
}

async function insertMail(email) {
  try {
    const query = "INSERT INTO USER_MAIL (email) VALUES ($1) RETURNING *";
    const values = [email];
    const result = await executeQuery(query, values);
    return result[0];
  } catch (error) {
    console.error("Error inserting email:", error);
    return [];
  }
}

async function getuserjobData(email) {
  try {
    const query = "SELECT id FROM JB_USERS WHERE email = $1";
    const userResult = await executeQuery(query, [email]);

    if (userResult.length === 0) {
      return [];
    }

    const userId = userResult[0].id;

    const jobQuery = "SELECT * FROM JB_JOBS WHERE user_id = $1";
    const jobResult = await executeQuery(jobQuery, [userId]);

    const notOkJobsQuery =
      "SELECT COUNT(*) AS count FROM JB_JOBS WHERE user_id = $1 AND is_ok = false";
    const notOkJobsResult = await executeQuery(notOkJobsQuery, [userId]);

    const numOfJobNotLive = notOkJobsResult[0].count;

    const result = {
      jobResult: jobResult,
      is_ok: numOfJobNotLive,
    };

    return result;
  } catch (error) {
    console.error("Error executing query:", error);
    return [];
  }
}

async function getData(offset, limit, searchTerm, location, remote) {
  try {
    let query = `SELECT * FROM JB_JOBS`;
    let conditions = [`is_ok = true`]; // Adding is_ok = true condition
    let params = [];

    if (searchTerm) {
      conditions.push(`job_title ILIKE $${params.length + 1}`);
      params.push(`%${searchTerm}%`);
    }

    if (remote === true) {
      conditions.push(`remote = $${params.length + 1}`);
      params.push(remote);
    }

    if (location && remote !== true) {
      conditions.push(`work_loc ILIKE $${params.length + 1}`);
      params.push(`%${location}%`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }

    query += ` OFFSET $${params.length + 1} LIMIT $${params.length + 2}`;
    params.push(offset, limit);

    const result = await executeQuery(query, params);
    return result;
  } catch (error) {
    console.error("Error executing query:", error);
    return [];
  }
}

async function getJobData(id) {
  try {
    const query = "SELECT * FROM JB_JOBS WHERE id = $1 AND is_ok = true";
    const result = await executeQuery(query, [id]);
    return result;
  } catch (error) {
    console.error("Error executing query:", error);
    return [];
  }
}

async function insertData(
  company_name,
  website,
  logo_url,
  job_title,
  work_loc,
  commitment,
  remote,
  job_link,
  description,
  name,
  email
) {
  try {
    const checkUserQuery = "SELECT id FROM JB_USERS WHERE email = $1";
    const checkUserValues = [email];
    const existingUsers = await executeQuery(checkUserQuery, checkUserValues);

    let userId;

    if (existingUsers.length === 0) {
      const insertUserQuery =
        "INSERT INTO JB_USERS (name, email) VALUES ($1, $2) RETURNING id";
      const insertUserValues = [name, email];
      const insertedUser = await executeQuery(
        insertUserQuery,
        insertUserValues
      );
      userId = insertedUser[0].id;
    } else {
      userId = existingUsers[0].id;
    }

    const insertJobQuery =
      "INSERT INTO JB_JOBS (user_id, company_name, website, logo_url, job_title, work_loc, commitment, remote, job_link, description, name) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *";
    const insertJobValues = [
      userId,
      company_name,
      website,
      logo_url,
      job_title,
      work_loc,
      commitment,
      remote,
      job_link,
      description,
      name,
    ];
    const insertedJob = await executeQuery(insertJobQuery, insertJobValues);

    return insertedJob[0];
  } catch (error) {
    console.error("Error executing query:", error);
    return [];
  }
}

async function deleteData(id) {
  try {
    const query = "DELETE FROM JB_JOBS WHERE id = $1 RETURNING *";
    const result = await executeQuery(query, [id]);
    return result[0];
  } catch (error) {
    console.error("Error executing query:", error);
    return [];
  }
}

async function updateData(
  id,
  company_name,
  website,
  job_title,
  work_loc,
  commitment,
  remote,
  job_link,
  description
) {
  try {
    const query = `
            UPDATE JB_JOBS 
            SET company_name = $1, 
                website = $2, 
                job_title = $3, 
                work_loc = $4,
                commitment = $5, 
                remote = $6, 
                job_link = $7, 
                description = $8 
            WHERE id = $9 RETURNING *`;
    const values = [
      company_name,
      website,
      job_title,
      work_loc,
      commitment,
      remote,
      job_link,
      description,
      id,
    ];
    const result = await executeQuery(query, values);
    return result[0];
  } catch (error) {
    console.error("Error executing query:", error);
    return [];
  }
}

cron.schedule("0 0 * * *", async () => {
  
  try {
    const queryText = `
            UPDATE jb_jobs 
            SET is_ok = FALSE 
            WHERE is_ok = TRUE 
              AND last_update < CURRENT_DATE - INTERVAL '30 day';
        `;
    await executeQuery(queryText);
    console.log("Scheduled job status update completed");
  } catch (error) {
    console.error("Error updating job statuses:", error);
  }
});

module.exports = {
  jobUpdate,
  getData,
  insertData,
  deleteData,
  updateData,
  getJobData,
  getuserjobData,
  insertMail,
  executeQuery,
};
