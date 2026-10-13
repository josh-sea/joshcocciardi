import { useNavigate } from 'react-router-dom';
import { useProfile } from '../lib/auth';
import { useToast } from '../lib/toast';
import { JobForm } from '../components/JobForm';

export function AddJob() {
  const { uid, profile } = useProfile();
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <>
      <h1>Add a job</h1>
      <p className="lead">A job that's done and still owed. We'll take it from here.</p>
      <JobForm uid={uid} profile={profile} onDone={(jobId) => {
        toast({ message: 'Job saved. Reminders are set.' });
        navigate(`/jobs/${jobId}`);
      }} />
    </>
  );
}
